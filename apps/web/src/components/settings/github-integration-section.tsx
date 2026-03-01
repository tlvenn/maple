import { Result, useAtomRefresh, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@maple/ui/components/ui/alert-dialog"
import { Button } from "@maple/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@maple/ui/components/ui/card"
import { Badge } from "@maple/ui/components/ui/badge"
import { Switch } from "@maple/ui/components/ui/switch"
import { Checkbox } from "@maple/ui/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@maple/ui/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@maple/ui/components/ui/dialog"
import {
  CircleCheckIcon,
  CircleXmarkIcon,
  LoaderIcon,
  NetworkNodesIcon,
  TrashIcon,
} from "@/components/icons"
import { MapleApiAtomClient } from "@/lib/services/common/atom-client"
import { getServiceOverviewResultAtom } from "@/lib/services/atoms/tinybird-query-atoms"
import { useEffectiveTimeRange } from "@/hooks/use-effective-time-range"

interface GitHubRepoInfo {
  id: number
  fullName: string
  owner: string
  name: string
}

interface ServiceRepoMappingInfo {
  serviceName: string
  repoFullName: string
}

interface GitHubIntegration {
  id: string
  orgId: string
  installationId: number
  githubAccountLogin: string
  githubAccountType: string
  selectedRepos: GitHubRepoInfo[]
  serviceRepoMappings: ServiceRepoMappingInfo[]
  enabled: boolean
  status: string
  lastSyncAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

interface AccessibleRepo {
  id: number
  fullName: string
  private: boolean
  defaultBranch: string
  owner: string
  name: string
}

const GITHUB_APP_NAME = "maple-agent"

interface GitHubIntegrationSectionProps {
  installationId?: number
  setupAction?: string
}

export function GitHubIntegrationSection({ installationId, setupAction }: GitHubIntegrationSectionProps) {
  const navigate = useNavigate()
  const [disconnectTarget, setDisconnectTarget] = useState<GitHubIntegration | null>(null)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [repoDialogOpen, setRepoDialogOpen] = useState(false)
  const [repoDialogIntegration, setRepoDialogIntegration] = useState<GitHubIntegration | null>(null)
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<number>>(new Set())
  const [isSavingRepos, setIsSavingRepos] = useState(false)
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false)
  const [mappingDialogIntegration, setMappingDialogIntegration] = useState<GitHubIntegration | null>(null)
  const [serviceMappings, setServiceMappings] = useState<Map<string, string>>(new Map())
  const [isSavingMappings, setIsSavingMappings] = useState(false)

  const listQueryAtom = MapleApiAtomClient.query("githubIntegrations", "list", {})
  const listResult = useAtomValue(listQueryAtom)
  const refreshIntegrations = useAtomRefresh(listQueryAtom)

  const reposQueryAtom = MapleApiAtomClient.query("githubIntegrations", "listRepos", {})
  const reposResult = useAtomValue(reposQueryAtom)
  const refreshRepos = useAtomRefresh(reposQueryAtom)

  const updateMutation = useAtomSet(
    MapleApiAtomClient.mutation("githubIntegrations", "update"),
    { mode: "promiseExit" },
  )
  const deleteMutation = useAtomSet(
    MapleApiAtomClient.mutation("githubIntegrations", "delete"),
    { mode: "promiseExit" },
  )
  const connectMutation = useAtomSet(
    MapleApiAtomClient.mutation("githubIntegrations", "connect"),
    { mode: "promiseExit" },
  )

  // Fetch known service names from Tinybird
  const { startTime, endTime } = useEffectiveTimeRange(undefined, undefined, "24h")
  const overviewResult = useAtomValue(
    getServiceOverviewResultAtom({ data: { startTime, endTime } } as any),
  )
  const serviceNames = Result.builder(overviewResult)
    .onSuccess((r) => [...new Set((r as { data: Array<{ serviceName: string }> }).data.map((s) => s.serviceName))].sort())
    .orElse(() => [] as string[])

  // Auto-connect when redirected back from GitHub App installation
  const connectAttempted = useRef(false)
  useEffect(() => {
    if (!installationId || !setupAction || connectAttempted.current) return
    connectAttempted.current = true

    void (async () => {
      toast.info("Connecting GitHub App...")
      const result = await connectMutation({
        payload: {
          installationId,
          setupAction,
        },
      })
      if (Exit.isSuccess(result)) {
        toast.success(`Connected to ${result.value.githubAccountLogin}`)
        refreshIntegrations()
      } else {
        toast.error("Failed to connect GitHub App")
      }
      // Clean up URL params
      void navigate({ to: "/settings", search: { tab: "integrations" }, replace: true })
    })()
  }, [installationId, setupAction, connectMutation, refreshIntegrations, navigate])

  const integrations = Result.builder(listResult)
    .onSuccess((response) => [...response.integrations] as GitHubIntegration[])
    .orElse(() => [])

  function handleInstallApp() {
    window.location.href = `https://github.com/apps/${GITHUB_APP_NAME}/installations/new`
  }

  async function handleDisconnect(integrationId: string) {
    setDisconnectTarget(null)
    setIsDisconnecting(true)
    const result = await deleteMutation({ path: { integrationId } })
    if (Exit.isSuccess(result)) {
      toast.success("GitHub integration disconnected")
      refreshIntegrations()
    } else {
      toast.error("Failed to disconnect GitHub integration")
    }
    setIsDisconnecting(false)
  }

  async function handleToggleEnabled(integration: GitHubIntegration) {
    setTogglingId(integration.id)
    const result = await updateMutation({
      path: { integrationId: integration.id },
      payload: { enabled: !integration.enabled },
    })
    if (Exit.isSuccess(result)) {
      refreshIntegrations()
    } else {
      toast.error("Failed to update integration")
    }
    setTogglingId(null)
  }

  const accessibleRepos = Result.builder(reposResult)
    .onSuccess((response) => [...response.repos] as AccessibleRepo[])
    .orElse(() => [])
  const isLoadingRepos = Result.isInitial(reposResult)

  function openRepoSelector(integration: GitHubIntegration) {
    setRepoDialogIntegration(integration)
    setSelectedRepoIds(new Set(integration.selectedRepos.map((r) => r.id)))
    setRepoDialogOpen(true)
    refreshRepos()
  }

  function toggleRepoSelection(repo: AccessibleRepo) {
    setSelectedRepoIds((prev) => {
      const next = new Set(prev)
      if (next.has(repo.id)) {
        next.delete(repo.id)
      } else {
        next.add(repo.id)
      }
      return next
    })
  }

  async function handleSaveRepos() {
    if (!repoDialogIntegration) return
    setIsSavingRepos(true)

    const selectedRepos: GitHubRepoInfo[] = accessibleRepos
      .filter((r) => selectedRepoIds.has(r.id))
      .map((r) => ({
        id: r.id,
        fullName: r.fullName,
        owner: r.owner,
        name: r.name,
      }))

    const result = await updateMutation({
      path: { integrationId: repoDialogIntegration.id },
      payload: { selectedRepos },
    })
    if (Exit.isSuccess(result)) {
      toast.success("Repository selection updated")
      setRepoDialogOpen(false)
      refreshIntegrations()
    } else {
      toast.error("Failed to update repository selection")
    }
    setIsSavingRepos(false)
  }

  function openMappingDialog(integration: GitHubIntegration) {
    setMappingDialogIntegration(integration)
    const initial = new Map<string, string>()
    for (const m of integration.serviceRepoMappings) {
      initial.set(m.serviceName, m.repoFullName)
    }
    setServiceMappings(initial)
    setMappingDialogOpen(true)
  }

  async function handleSaveMappings() {
    if (!mappingDialogIntegration) return
    setIsSavingMappings(true)

    const mappingsArray: ServiceRepoMappingInfo[] = []
    for (const [serviceName, repoFullName] of serviceMappings) {
      if (repoFullName) {
        mappingsArray.push({ serviceName, repoFullName })
      }
    }

    const result = await updateMutation({
      path: { integrationId: mappingDialogIntegration.id },
      payload: { serviceRepoMappings: mappingsArray },
    })
    if (Exit.isSuccess(result)) {
      toast.success("Service mappings updated")
      setMappingDialogOpen(false)
      refreshIntegrations()
    } else {
      toast.error("Failed to update service mappings")
    }
    setIsSavingMappings(false)
  }

  const hasIntegrations = integrations.length > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <NetworkNodesIcon size={14} className="text-muted-foreground" />
              GitHub Integration
            </CardTitle>
            <CardDescription>
              Connect a GitHub App to automatically create issues when anomalies are detected.
            </CardDescription>
          </div>
          {hasIntegrations ? null : (
            <Button size="sm" onClick={handleInstallApp}>
              Install GitHub App
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {Result.isInitial(listResult) ? (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm justify-center">
            <LoaderIcon size={14} className="animate-spin" />
            Loading...
          </div>
        ) : !Result.isSuccess(listResult) ? (
          <div className="text-muted-foreground py-8 text-center text-sm">
            Failed to load GitHub integrations.
          </div>
        ) : !hasIntegrations ? (
          <div className="text-muted-foreground py-8 text-center text-sm">
            No GitHub App installed. Install the Maple GitHub App to enable automatic issue creation for detected anomalies.
          </div>
        ) : (
          <div className="space-y-3">
            {integrations.map((integration) => (
              <div
                key={integration.id}
                className="flex items-center gap-3 rounded-md border p-3"
              >
                <Switch
                  checked={integration.enabled}
                  onCheckedChange={() => handleToggleEnabled(integration)}
                  disabled={togglingId === integration.id}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {integration.githubAccountLogin}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {integration.githubAccountType}
                    </Badge>
                    {integration.status === "connected" ? (
                      <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
                        <CircleCheckIcon size={10} />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] gap-1 px-1.5 py-0">
                        <CircleXmarkIcon size={10} />
                        {integration.status}
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs mt-0.5">
                    {integration.selectedRepos.length === 0
                      ? "No repositories selected"
                      : `${integration.selectedRepos.length} repo${integration.selectedRepos.length === 1 ? "" : "s"} selected${integration.serviceRepoMappings.length > 0 ? ` · ${integration.serviceRepoMappings.length} service mapping${integration.serviceRepoMappings.length === 1 ? "" : "s"}` : ""}`}
                  </div>
                  {integration.lastError && (
                    <div className="text-destructive text-xs mt-0.5 truncate">
                      {integration.lastError}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openRepoSelector(integration)}
                >
                  Select Repos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openMappingDialog(integration)}
                  disabled={integration.selectedRepos.length === 0}
                >
                  Map Services
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDisconnectTarget(integration)}
                  disabled={isDisconnecting}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <TrashIcon size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Repo Selector Dialog */}
      <Dialog open={repoDialogOpen} onOpenChange={setRepoDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Repositories</DialogTitle>
            <DialogDescription>
              Choose which repositories the Maple agent should create issues in when anomalies are detected.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-1 py-2">
            {isLoadingRepos ? (
              <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm justify-center">
                <LoaderIcon size={14} className="animate-spin" />
                Loading repositories...
              </div>
            ) : accessibleRepos.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center text-sm">
                No repositories found. Check your GitHub App installation permissions.
              </div>
            ) : (
              accessibleRepos.map((repo) => (
                <label
                  key={repo.id}
                  className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedRepoIds.has(repo.id)}
                    onCheckedChange={() => toggleRepoSelection(repo)}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{repo.fullName}</span>
                    {repo.private && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-2">
                        Private
                      </Badge>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRepoDialogOpen(false)}
              disabled={isSavingRepos}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveRepos} disabled={isSavingRepos || isLoadingRepos}>
              {isSavingRepos ? (
                <>
                  <LoaderIcon size={14} className="animate-spin" />
                  Saving...
                </>
              ) : (
                `Save (${selectedRepoIds.size} selected)`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service Mapping Dialog */}
      <Dialog open={mappingDialogOpen} onOpenChange={setMappingDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Map Services to Repositories</DialogTitle>
            <DialogDescription>
              Assign each service to a specific repository for issue creation. Unmapped services will use the first selected repo as default.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-2 py-2">
            {serviceNames.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center text-sm">
                No services found. Send some traces to see your services here.
              </div>
            ) : (
              serviceNames.map((svc) => (
                <div key={svc} className="flex items-center gap-3 px-1">
                  <span className="text-sm font-medium min-w-0 flex-1 truncate">{svc}</span>
                  <Select
                    value={serviceMappings.get(svc) ?? "__default__"}
                    onValueChange={(value: string | null) => {
                      setServiceMappings((prev) => {
                        const next = new Map(prev)
                        if (!value || value === "__default__") {
                          next.delete(svc)
                        } else {
                          next.set(svc, value)
                        }
                        return next
                      })
                    }}
                  >
                    <SelectTrigger className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Default (first repo)</SelectItem>
                      {mappingDialogIntegration?.selectedRepos.map((repo) => (
                        <SelectItem key={repo.fullName} value={repo.fullName}>
                          {repo.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMappingDialogOpen(false)}
              disabled={isSavingMappings}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveMappings} disabled={isSavingMappings || serviceNames.length === 0}>
              {isSavingMappings ? (
                <>
                  <LoaderIcon size={14} className="animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Mappings"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation */}
      <AlertDialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => { if (!open) setDisconnectTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect GitHub integration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect the GitHub integration for{" "}
              <span className="font-medium text-foreground">
                {disconnectTarget?.githubAccountLogin}
              </span>
              ? The Maple agent will stop creating issues in connected repositories.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (disconnectTarget) {
                  void handleDisconnect(disconnectTarget.id)
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
