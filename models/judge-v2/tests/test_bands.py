from judge.evaluate.bands import choose_bands


def test_bands_route_uncertain_rules_to_a_better_second_model():
    fast = [0.95, 0.85, 0.6, 0.55, 0.05, 0.4]
    second = [0.97, 0.10, 0.9, 0.05, 0.02, 0.92]
    labels = [1, 0, 1, 0, 0, 1]
    crit = [True, False, False, False, False, True]
    b = choose_bands(fast, second, labels, crit, max_routed=0.7)
    assert b["precision"] == 1.0 and b["recall"] == 1.0 and b["routed"] <= 0.7


def test_bands_return_none_when_constraints_cannot_be_met():
    # a leak scored 0.0 can only be caught by routing it, and routing is not allowed here
    assert choose_bands([0.9, 0.0], [0.1, 0.9], [0, 1], [False, False], max_routed=0.0) is None


def test_choose_confirm_maximises_recall_under_a_precision_floor():
    from judge.evaluate.bands import choose_confirm
    fast = [0.95, 0.9, 0.8, 0.75, 0.5, 0.3]
    second = [0.99, 0.2, 0.95, 0.9, 0.9, 0.99]
    labels = [1, 0, 1, 0, 1, 1]
    c = choose_confirm(fast, second, labels, min_precision=1.0)
    assert c["precision"] == 1.0 and c["recall"] == 0.75
    assert c["fast_min"] <= 0.5 and c["second_min"] > 0.9
