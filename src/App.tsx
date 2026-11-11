import { AppShell } from './components/AppShell'
import { DashboardProvider } from './state/DashboardContext'

export function App() {
  return (
    <DashboardProvider>
      <AppShell />
    </DashboardProvider>
  )
}
