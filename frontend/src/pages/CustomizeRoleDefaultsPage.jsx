import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { Select } from '../components/ui/select'
import { Skeleton } from '../components/ui/skeleton'

const ROLE_ORDER = {
  super_admin: 0,
  senior: 1,
  manager: 2,
  team_leader: 3,
  user: 4,
}

function toScopePayload(scopeFilter) {
  const payload = {}
  if (scopeFilter.company_id) payload.company_id = Number(scopeFilter.company_id)
  if (scopeFilter.entity_id) payload.entity_id = Number(scopeFilter.entity_id)
  if (scopeFilter.entity_type) payload.entity_type = scopeFilter.entity_type
  return payload
}

function toQueryString(scopeFilter) {
  const params = new URLSearchParams()
  if (scopeFilter.company_id) params.set('company_id', scopeFilter.company_id)
  if (scopeFilter.entity_id) params.set('entity_id', scopeFilter.entity_id)
  if (scopeFilter.entity_type) params.set('entity_type', scopeFilter.entity_type)
  const query = params.toString()
  return query ? `?${query}` : ''
}

function roleCardTone() {
  return 'bg-card border-border'
}

function RoleCard({ role, scopeQuery }) {
  return (
    <Card className={`border-2 shadow-none ${roleCardTone()}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-extrabold uppercase tracking-tight">{role.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{role.description || `Default role: ${role.name}`}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-100">{role.user_count || 0} users</Badge>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={`/admin/roles/customize/${role.id}${scopeQuery}`}>
            <Button type="button" size="sm">Edit permissions</Button>
          </Link>
        </div>
      </CardHeader>
    </Card>
  )
}

function CustomizeRoleDefaultsPage() {
  const { user } = useAuth()
  const roleKeys = user?.role_keys || []
  const isSuperAdmin = roleKeys.includes('super_admin')
  const isSenior = roleKeys.includes('senior')

  const [searchParams, setSearchParams] = useSearchParams()
  const [state, setState] = useState({ loading: true, error: '', data: null })

  const [roleScopeFilter, setRoleScopeFilter] = useState({
    company_id: searchParams.get('company_id') || '',
    entity_id: searchParams.get('entity_id') || '',
    entity_type: searchParams.get('entity_type') || '',
  })

  useEffect(() => {
    let active = true

    async function loadData() {
      setState((current) => ({ ...current, loading: true, error: '' }))
      try {
        const params = toScopePayload(roleScopeFilter)
        const rolesRes = await api.get('/admin/roles/', { params })
        if (!active) return
        setState({ loading: false, error: '', data: rolesRes.data || {} })
      } catch (error) {
        if (!active) return
        setState({ loading: false, error: error.response?.data?.detail || 'Could not load role defaults.', data: null })
      }
    }

    loadData()
    return () => {
      active = false
    }
  }, [roleScopeFilter.company_id, roleScopeFilter.entity_id, roleScopeFilter.entity_type])

  useEffect(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (roleScopeFilter.company_id) next.set('company_id', roleScopeFilter.company_id)
      else next.delete('company_id')
      if (roleScopeFilter.entity_id) next.set('entity_id', roleScopeFilter.entity_id)
      else next.delete('entity_id')
      if (roleScopeFilter.entity_type) next.set('entity_type', roleScopeFilter.entity_type)
      else next.delete('entity_type')
      return next
    }, { replace: true })
  }, [roleScopeFilter.company_id, roleScopeFilter.entity_id, roleScopeFilter.entity_type, setSearchParams])

  const sortedRoles = useMemo(() => {
    const roles = state.data?.roles || []
    const hideUpperRolesInEntityScope = Boolean(roleScopeFilter.entity_type || roleScopeFilter.entity_id)
    const visibleRoles = roles.filter((role) => {
      if (role.key === 'super_admin') return false
      if (hideUpperRolesInEntityScope && role.key === 'senior') return false
      return true
    })
    return [...visibleRoles].sort((a, b) => {
      const aOrder = ROLE_ORDER[a.key] ?? 99
      const bOrder = ROLE_ORDER[b.key] ?? 99
      if (aOrder !== bOrder) return aOrder - bOrder
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [roleScopeFilter.entity_id, roleScopeFilter.entity_type, state.data?.roles])

  const companyOptions = state.data?.company_options || []
  const entityOptions = state.data?.entity_options || []
  const filteredEntityOptions = entityOptions.filter((item) => !roleScopeFilter.entity_type || item.entity_type === roleScopeFilter.entity_type)
  const scopeQuery = toQueryString(roleScopeFilter)

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Customize Default Permissions"
        description="Open a role and edit its default permissions on a dedicated page."
        actions={(
          <Link to="/admin/roles">
            <Button>Back to Roles</Button>
          </Link>
        )}
      />

      {(isSuperAdmin || isSenior) && (
        <Card className="border-2 shadow-none">
          <CardContent className="flex flex-wrap items-center gap-3 p-4 lg:flex-nowrap">
            {isSuperAdmin && (
              <Select
                className="app-select min-w-[230px] flex-1"
                value={roleScopeFilter.company_id}
                onChange={(event) =>
                  setRoleScopeFilter({
                    company_id: event.target.value,
                    entity_id: '',
                    entity_type: roleScopeFilter.entity_type,
                  })
                }
              >
                <option value="">General (all companies)</option>
                {companyOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </Select>
            )}
            <Select
              className="app-select min-w-[210px] flex-1"
              value={roleScopeFilter.entity_type}
              onChange={(event) =>
                setRoleScopeFilter((current) => ({
                  ...current,
                  entity_type: event.target.value,
                  entity_id: '',
                }))
              }
            >
              <option value="">All entity types</option>
              <option value="PROD">Prod</option>
              <option value="SUPPORT">Support</option>
              <option value="TDEV">Dev</option>
            </Select>
            <Select
              className="app-select min-w-[230px] flex-1"
              value={roleScopeFilter.entity_id}
              onChange={(event) =>
                setRoleScopeFilter((current) => ({
                  ...current,
                  entity_id: event.target.value,
                }))
              }
            >
              <option value="">General (all entities)</option>
              {filteredEntityOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label || item.name}</option>
              ))}
            </Select>
          </CardContent>
        </Card>
      )}

      {state.loading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-44 w-full rounded-md" />
          <Skeleton className="h-44 w-full rounded-md" />
          <Skeleton className="h-44 w-full rounded-md" />
        </div>
      )}

      {!state.loading && state.error && (
        <Card className="shadow-none">
          <CardContent className="p-6 text-center text-sm font-bold text-destructive">{state.error}</CardContent>
        </Card>
      )}

      {!state.loading && !state.error && (
        <div className="grid gap-4 lg:grid-cols-2">
          {sortedRoles.map((role) => (
            <RoleCard key={role.id} role={role} scopeQuery={scopeQuery} />
          ))}
        </div>
      )}
    </main>
  )
}

export default CustomizeRoleDefaultsPage
