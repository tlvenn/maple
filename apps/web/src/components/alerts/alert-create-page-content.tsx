import { useSearch } from "@tanstack/react-router"
import { useMemo } from "react"

import type { AlertDestinationDocument, AlertRuleDocument, DashboardDocument } from "@maple/domain/http"

import { AlertCreateFormSurface } from "@/components/alerts/alert-create-form-surface"
import { useAutocompleteValuesContext } from "@/hooks/use-autocomplete-values"
import { defaultRuleForm, ruleToFormState, type RuleFormState } from "@/lib/alerts/form-utils"
import { resolveWidgetAlertPrefill, type WidgetAlertPrefillNotice } from "@/lib/alerts/widget-prefill"
import { Result, useAtomValue } from "@/lib/effect-atom"
import { MapleApiAtomClient } from "@/lib/services/common/atom-client"

type AlertCreateSearchValue = {
	serviceName?: string
	ruleId?: string
	dashboardId?: string
	widgetId?: string
}

type InitialRuleDraft = {
	key: string
	form: RuleFormState
	prefillNotices: WidgetAlertPrefillNotice[]
	editingRule: AlertRuleDocument | null
	showTemplatesInitially: boolean
}

export function AlertCreatePageContent() {
	const search = useSearch({ from: "/alerts/create" }) as AlertCreateSearchValue

	const destinationsQueryAtom = MapleApiAtomClient.query("alerts", "listDestinations", {
		reactivityKeys: ["alertDestinations"],
	})
	const rulesQueryAtom = MapleApiAtomClient.query("alerts", "listRules", {
		reactivityKeys: ["alertRules"],
	})
	const dashboardsQueryAtom = MapleApiAtomClient.query("dashboards", "list", {
		reactivityKeys: ["dashboards"],
	})
	const destinationsResult = useAtomValue(destinationsQueryAtom)
	const rulesResult = useAtomValue(rulesQueryAtom)
	const dashboardsResult = useAtomValue(dashboardsQueryAtom)

	const autocompleteValues = useAutocompleteValuesContext()
	const serviceNameOptions = autocompleteValues.traces.services ?? []

	const destinations = Result.builder(destinationsResult)
		.onSuccess((response) => [...response.destinations] as AlertDestinationDocument[])
		.orElse(() => [])

	const initialDraft = useMemo(
		() =>
			deriveInitialRuleDraft({
				search,
				rulesResult,
				dashboardsResult,
			}),
		[search, rulesResult, dashboardsResult],
	)

	return (
		<AlertCreateFormSurface
			key={initialDraft.key}
			initialForm={initialDraft.form}
			prefillNotices={initialDraft.prefillNotices}
			editingRule={initialDraft.editingRule}
			showTemplatesInitially={initialDraft.showTemplatesInitially}
			destinations={destinations}
			serviceNameOptions={serviceNameOptions}
			autocompleteValues={autocompleteValues}
		/>
	)
}

function deriveInitialRuleDraft({
	search,
	rulesResult,
	dashboardsResult,
}: {
	search: AlertCreateSearchValue
	rulesResult: Result.Result<{ rules: readonly AlertRuleDocument[] }, unknown>
	dashboardsResult: Result.Result<
		{
			dashboards: readonly DashboardDocument[]
		},
		unknown
	>
}): InitialRuleDraft {
	const base = defaultRuleForm(search.serviceName)

	if (search.ruleId) {
		if (Result.isSuccess(rulesResult)) {
			const editingRule = rulesResult.value.rules.find((rule) => rule.id === search.ruleId) ?? null
			if (editingRule) {
				return {
					key: `rule:${editingRule.id}`,
					form: ruleToFormState(editingRule),
					prefillNotices: [],
					editingRule,
					showTemplatesInitially: false,
				}
			}
			return {
				key: `missing-rule:${search.ruleId}`,
				form: base,
				prefillNotices: [
					{
						severity: "warning",
						message: "The alert rule could not be found. Starting from a blank alert.",
					},
				],
				editingRule: null,
				showTemplatesInitially: false,
			}
		}
		return {
			key: `loading-rule:${search.ruleId}`,
			form: base,
			prefillNotices: [],
			editingRule: null,
			showTemplatesInitially: false,
		}
	}

	if (search.dashboardId || search.widgetId) {
		if (!search.dashboardId || !search.widgetId) {
			const result = resolveWidgetAlertPrefill({
				dashboards: [],
				dashboardId: search.dashboardId,
				widgetId: search.widgetId,
				base,
			})
			return {
				key: `missing-chart-source:${search.dashboardId ?? "dashboard"}:${search.widgetId ?? "widget"}`,
				form: result.form,
				prefillNotices: result.notices,
				editingRule: null,
				showTemplatesInitially: false,
			}
		}
		if (Result.isSuccess(dashboardsResult)) {
			const result = resolveWidgetAlertPrefill({
				dashboards: dashboardsResult.value.dashboards,
				dashboardId: search.dashboardId,
				widgetId: search.widgetId,
				base,
			})
			return {
				key: `dashboard:${search.dashboardId}:widget:${search.widgetId}`,
				form: result.form,
				prefillNotices: result.notices,
				editingRule: null,
				showTemplatesInitially: false,
			}
		}
		if (Result.isFailure(dashboardsResult)) {
			return {
				key: `dashboard-load-failed:${search.dashboardId}:${search.widgetId}`,
				form: base,
				prefillNotices: [
					{
						severity: "warning",
						message: "Dashboards could not be loaded. Starting from a blank alert.",
					},
				],
				editingRule: null,
				showTemplatesInitially: false,
			}
		}
		return {
			key: `loading-dashboard:${search.dashboardId}:${search.widgetId}`,
			form: base,
			prefillNotices: [],
			editingRule: null,
			showTemplatesInitially: false,
		}
	}

	return {
		key: `new:${search.serviceName ?? "blank"}`,
		form: base,
		prefillNotices: [],
		editingRule: null,
		showTemplatesInitially: search.serviceName == null,
	}
}
