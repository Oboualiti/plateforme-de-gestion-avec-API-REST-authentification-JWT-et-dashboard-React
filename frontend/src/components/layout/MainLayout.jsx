import { Outlet } from 'react-router-dom'
import { AppShell } from '../AppShell'

function MainLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export default MainLayout
