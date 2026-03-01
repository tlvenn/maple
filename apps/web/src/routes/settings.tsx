import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Schema } from "effect"

import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@maple/ui/components/ui/tabs"
import { isClerkAuthEnabled } from "@/lib/services/common/auth-mode"
import { BillingSection } from "@/components/settings/billing-section"
import { GitHubIntegrationSection } from "@/components/settings/github-integration-section"
import { MembersSection } from "@/components/settings/members-section"

const SettingsSearch = Schema.Struct({
  tab: Schema.optionalWith(
    Schema.Literal("members", "billing", "integrations"),
    { default: () => "members" as const },
  ),
  installation_id: Schema.optional(Schema.Number),
  setup_action: Schema.optional(Schema.String),
})

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  validateSearch: Schema.standardSchemaV1(SettingsSearch),
})

function SettingsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  if (!isClerkAuthEnabled) {
    return (
      <DashboardLayout
        breadcrumbs={[{ label: "Settings" }]}
        title="Settings"
        description="Workspace settings."
      >
        <p className="text-muted-foreground text-sm">
          No additional settings to configure in self-hosted mode.
        </p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      breadcrumbs={[{ label: "Settings" }]}
      title="Settings"
      description="Manage your workspace settings."
    >
      <Tabs
        value={search.tab}
        onValueChange={(tab) =>
          navigate({ search: { tab: tab as "members" | "billing" | "integrations" } })
        }
      >
        <TabsList variant="line">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="billing">Usage & Billing</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="pt-4">
          <MembersSection />
        </TabsContent>
        <TabsContent value="billing" className="pt-4">
          <BillingSection />
        </TabsContent>
        <TabsContent value="integrations" className="pt-4">
          <GitHubIntegrationSection
            installationId={search.installation_id}
            setupAction={search.setup_action}
          />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  )
}
