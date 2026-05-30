$container = "prompt-saviour-pg"
$db        = "promptshield_test"
$user      = "postgres"

function q($sql) {
    docker exec $container psql -U $user -d $db -c $sql
}

Write-Host "`n=== Tenants (check clerk_org_id) ===" -ForegroundColor Cyan
q "SELECT id, name, slug, clerk_org_id FROM tenants;"

Write-Host "`n=== Members (check clerk_id and role) ===" -ForegroundColor Cyan
q "SELECT id, email, role, clerk_id FROM members;"
