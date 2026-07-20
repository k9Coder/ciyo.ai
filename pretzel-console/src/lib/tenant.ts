const TENANT_KEY = 'mykka.selectedTenantId'

export function getSelectedTenantId(): string | null {
  return localStorage.getItem(TENANT_KEY)
}

export function setSelectedTenantId(id: string): void {
  localStorage.setItem(TENANT_KEY, id)
}

export function clearSelectedTenantId(): void {
  localStorage.removeItem(TENANT_KEY)
}
