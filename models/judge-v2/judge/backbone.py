from dataclasses import asdict, dataclass

import torch
import torch.nn.functional as F
from torch import nn
from torch.utils.checkpoint import checkpoint

NEG = -1e9


@dataclass(frozen=True)
class BackboneSpec:
    arch: str
    vocab_size: int
    hidden_size: int
    num_layers: int
    num_heads: int
    num_kv_heads: int
    head_dim: int
    intermediate_size: int
    rms_eps: float
    layer_types: tuple
    rope_theta: dict
    rope_linear_factor: dict
    sliding_window: int | None
    query_scale: float
    attn_softcap: float | None
    embed_scale: float
    activation: str

    @staticmethod
    def from_hf_config(cfg) -> "BackboneSpec":
        if cfg.model_type == "llama":
            head_dim = getattr(cfg, "head_dim", None) or cfg.hidden_size // cfg.num_attention_heads
            theta, factor = _rope_params(cfg.rope_parameters)
            return BackboneSpec(
                "llama", cfg.vocab_size, cfg.hidden_size, cfg.num_hidden_layers, cfg.num_attention_heads,
                cfg.num_key_value_heads, head_dim, cfg.intermediate_size, cfg.rms_norm_eps,
                ("full_attention",) * cfg.num_hidden_layers, {"full_attention": theta},
                {"full_attention": factor}, None, head_dim ** -0.5, None, 1.0, "silu")
        if cfg.model_type == "qwen3":
            # Llama layout plus per-head RMSNorm on q and k (no +1 offset, unlike Gemma 3).
            rp = getattr(cfg, "rope_parameters", None) or {"rope_theta": cfg.rope_theta}
            theta, factor = _rope_params(rp)
            return BackboneSpec(
                "qwen3", cfg.vocab_size, cfg.hidden_size, cfg.num_hidden_layers, cfg.num_attention_heads,
                cfg.num_key_value_heads, cfg.head_dim, cfg.intermediate_size, cfg.rms_norm_eps,
                ("full_attention",) * cfg.num_hidden_layers, {"full_attention": theta},
                {"full_attention": factor}, None, cfg.head_dim ** -0.5, None, 1.0, "silu")
        if cfg.model_type == "gemma3_text":
            types = tuple(cfg.layer_types)
            thetas, factors = {}, {}
            for t in sorted(set(types)):
                thetas[t], factors[t] = _rope_params(cfg.rope_parameters[t])
            return BackboneSpec(
                "gemma3", cfg.vocab_size, cfg.hidden_size, cfg.num_hidden_layers, cfg.num_attention_heads,
                cfg.num_key_value_heads, cfg.head_dim, cfg.intermediate_size, cfg.rms_norm_eps, types,
                thetas, factors, cfg.sliding_window, cfg.query_pre_attn_scalar ** -0.5,
                cfg.attn_logit_softcapping, cfg.hidden_size ** 0.5, "gelu_tanh")
        raise ValueError(f"unsupported model_type {cfg.model_type!r}")


def _rope_params(rp: dict) -> tuple[float, float]:
    rtype = rp.get("rope_type", "default")
    if rtype == "default":
        return float(rp["rope_theta"]), 1.0
    if rtype == "linear":
        return float(rp["rope_theta"]), float(rp["factor"])
    raise ValueError(f"unsupported rope_type {rtype!r}")


def spec_to_json(spec: BackboneSpec) -> dict:
    d = asdict(spec)
    d["layer_types"] = list(spec.layer_types)
    return d


def spec_from_json(d: dict) -> BackboneSpec:
    return BackboneSpec(**{**d, "layer_types": tuple(d["layer_types"])})


class RMSNorm(nn.Module):
    def __init__(self, dim: int, eps: float, offset: bool):
        super().__init__()
        self.eps, self.offset = eps, offset
        self.weight = nn.Parameter(torch.zeros(dim) if offset else torch.ones(dim))

    def forward(self, x):
        xf = x.float()
        y = xf * torch.rsqrt(xf.pow(2).mean(-1, keepdim=True) + self.eps)
        w = 1.0 + self.weight.float() if self.offset else self.weight.float()
        return (y * w).type_as(x)


def _rope(x, pos, inv_freq):
    freqs = pos[0].float()[:, None] * inv_freq[None, :]
    emb = torch.cat([freqs, freqs], -1)
    cos, sin = emb.cos()[None, None], emb.sin()[None, None]
    half = x.shape[-1] // 2
    rot = torch.cat([-x[..., half:], x[..., :half]], -1)
    return x * cos + rot * sin


class Attention(nn.Module):
    def __init__(self, spec: BackboneSpec, layer_type: str):
        super().__init__()
        h, d = spec.hidden_size, spec.head_dim
        self.n, self.kv, self.d = spec.num_heads, spec.num_kv_heads, d
        self.q_proj = nn.Linear(h, self.n * d, bias=False)
        self.k_proj = nn.Linear(h, self.kv * d, bias=False)
        self.v_proj = nn.Linear(h, self.kv * d, bias=False)
        self.o_proj = nn.Linear(self.n * d, h, bias=False)
        self.qk_norm = spec.arch in ("gemma3", "qwen3")
        if self.qk_norm:
            offset = spec.arch == "gemma3"
            self.q_norm = RMSNorm(d, spec.rms_eps, offset)
            self.k_norm = RMSNorm(d, spec.rms_eps, offset)
        self.scale, self.softcap = spec.query_scale, spec.attn_softcap
        self.window = spec.sliding_window if layer_type == "sliding_attention" else None
        theta, factor = spec.rope_theta[layer_type], spec.rope_linear_factor[layer_type]
        inv = 1.0 / (theta ** (torch.arange(0, d, 2, dtype=torch.float32) / d)) / factor
        self.register_buffer("inv_freq", inv, persistent=False)

    def forward(self, x, pos, bias, pk, pv):
        b, s, _ = x.shape
        q = self.q_proj(x).view(b, s, self.n, self.d).transpose(1, 2)
        k = self.k_proj(x).view(b, s, self.kv, self.d).transpose(1, 2)
        v = self.v_proj(x).view(b, s, self.kv, self.d).transpose(1, 2)
        if self.qk_norm:
            q, k = self.q_norm(q), self.k_norm(k)
        q, k = _rope(q, pos, self.inv_freq), _rope(k, pos, self.inv_freq)
        k, v = torch.cat([pk, k], 2), torch.cat([pv, v], 2)
        rep = self.n // self.kv
        att = (q @ k.repeat_interleave(rep, 1).transpose(-1, -2)) * self.scale
        if self.softcap is not None:
            att = torch.tanh(att / self.softcap) * self.softcap
        att = att + bias
        if self.window is not None:
            kpos = torch.cat([torch.arange(pk.shape[2], device=x.device), pos[0]])
            dist = pos[0][:, None] - kpos[None, :]
            att = att + torch.where(dist >= self.window, NEG, 0.0)
        y = att.softmax(-1) @ v.repeat_interleave(rep, 1)
        return self.o_proj(y.transpose(1, 2).reshape(b, s, self.n * self.d)), k, v


class MLP(nn.Module):
    def __init__(self, spec: BackboneSpec):
        super().__init__()
        h, f = spec.hidden_size, spec.intermediate_size
        self.gate_proj = nn.Linear(h, f, bias=False)
        self.up_proj = nn.Linear(h, f, bias=False)
        self.down_proj = nn.Linear(f, h, bias=False)
        self.activation = spec.activation

    def forward(self, x):
        g = self.gate_proj(x)
        g = F.silu(g) if self.activation == "silu" else F.gelu(g, approximate="tanh")
        return self.down_proj(g * self.up_proj(x))


class Block(nn.Module):
    def __init__(self, spec: BackboneSpec, layer_type: str):
        super().__init__()
        g = spec.arch == "gemma3"
        h, eps = spec.hidden_size, spec.rms_eps
        self.self_attn, self.mlp = Attention(spec, layer_type), MLP(spec)
        self.input_layernorm = RMSNorm(h, eps, g)
        self.post_attention_layernorm = RMSNorm(h, eps, g)
        self.sandwich = g
        if g:
            self.pre_feedforward_layernorm = RMSNorm(h, eps, True)
            self.post_feedforward_layernorm = RMSNorm(h, eps, True)

    def forward(self, x, pos, bias, pk, pv):
        a, k, v = self.self_attn(self.input_layernorm(x), pos, bias, pk, pv)
        if self.sandwich:
            x = x + self.post_attention_layernorm(a)
            x = x + self.post_feedforward_layernorm(self.mlp(self.pre_feedforward_layernorm(x)))
        else:
            x = x + a
            x = x + self.mlp(self.post_attention_layernorm(x))
        return x, k, v


class Backbone(nn.Module):
    def __init__(self, spec: BackboneSpec):
        super().__init__()
        self.spec = spec
        self.checkpointing = False
        self.embed_tokens = nn.Embedding(spec.vocab_size, spec.hidden_size)
        self.layers = nn.ModuleList(Block(spec, t) for t in spec.layer_types)
        self.norm = RMSNorm(spec.hidden_size, spec.rms_eps, spec.arch == "gemma3")
        self.register_buffer("embed_scale", torch.tensor(spec.embed_scale), persistent=False)

    def forward(self, input_ids, position_ids, attn_bias, past_k, past_v):
        x = self.embed_tokens(input_ids) * self.embed_scale
        ks, vs = [], []
        for i, layer in enumerate(self.layers):
            if self.checkpointing and self.training:
                x, k, v = checkpoint(layer, x, position_ids, attn_bias, past_k[i], past_v[i], use_reentrant=False)
            else:
                x, k, v = layer(x, position_ids, attn_bias, past_k[i], past_v[i])
            ks.append(k)
            vs.append(v)
        return self.norm(x), torch.stack(ks), torch.stack(vs)

    def empty_past(self, device=None):
        s = self.spec
        z = torch.zeros(s.num_layers, 1, s.num_kv_heads, 0, s.head_dim, device=device)
        return z, z.clone()

    @staticmethod
    def from_hf_model(hf_model) -> "Backbone":
        bb = Backbone(BackboneSpec.from_hf_config(hf_model.config))
        bb.load_state_dict(hf_model.model.state_dict(), strict=True)
        return bb
