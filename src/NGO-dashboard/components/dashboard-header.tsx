import { Heart, Users, DollarSign } from "lucide-react"

export function DashboardHeader() {
  return (
    <header className="bg-card border-b border-border">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-primary rounded-lg">
              <Heart className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Hope Foundation</h1>
              <p className="text-muted-foreground">Humanitarian Aid Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Active Recipients:</span>
              <span className="font-semibold text-foreground">247</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Last Updated:</span>
              <span className="font-semibold text-foreground">2 min ago</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
