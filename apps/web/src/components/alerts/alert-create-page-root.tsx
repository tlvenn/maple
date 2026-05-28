import { AutocompleteValuesProvider } from "@/hooks/use-autocomplete-values"
import { useEffectiveTimeRange } from "@/hooks/use-effective-time-range"
import { AlertCreatePageContent } from "@/components/alerts/alert-create-page-content"

export function AlertCreatePageRoot() {
	const { startTime, endTime } = useEffectiveTimeRange(undefined, undefined, "24h")
	return (
		<AutocompleteValuesProvider startTime={startTime} endTime={endTime}>
			<AlertCreatePageContent />
		</AutocompleteValuesProvider>
	)
}
