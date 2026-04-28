import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './api'

export function buildUsersParams({ page, pageSize, search, role, companyId, entityId, status }) {
  const params = {
    page,
    page_size: pageSize,
  }
  if ((search || '').trim()) params.search = search.trim()
  if (role && role !== 'all') params.role = role
  if (companyId && companyId !== 'all') params.company_id = Number(companyId)
  if (entityId && entityId !== 'all') params.entity_id = Number(entityId)
  if (status && status !== 'all') params.status = status
  return params
}

export function useManageableUsersOptions() {
  return useQuery({
    queryKey: ['users', 'manageable-options'],
    queryFn: async () => {
      const { data } = await api.get('/admin/users/manageable/options/')
      return {
        companies: Array.isArray(data?.company_options) ? data.company_options : [],
        entities: Array.isArray(data?.entity_options) ? data.entity_options : [],
      }
    },
    staleTime: 10 * 60 * 1000,
  })
}

export function useManageableUsers(params) {
  return useQuery({
    queryKey: ['users', 'manageable-list', params],
    queryFn: async () => {
      const { data } = await api.get('/admin/users/manageable/', { params: buildUsersParams(params) })
      return {
        rows: Array.isArray(data?.results) ? data.results : [],
        count: Number(data?.count || 0),
        next: data?.next || null,
        previous: data?.previous || null,
      }
    },
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  })
}

export function useDeleteManageableUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId) => {
      await api.delete(`/admin/users/manageable/${userId}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'manageable-list'] })
    },
  })
}

export function useCreateManageableUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload) => {
      const response = await api.post('/admin/users/manageable/', payload)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'manageable-list'] })
      queryClient.invalidateQueries({ queryKey: ['users', 'manageable-options'] })
    },
  })
}

export function useUpdateManageableUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, payload }) => {
      const response = await api.patch(`/admin/users/manageable/${userId}/`, payload)
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users', 'manageable-list'] })
      if (variables?.userId) {
        queryClient.invalidateQueries({ queryKey: ['users', 'detail', variables.userId] })
      }
    },
  })
}
