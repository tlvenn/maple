export interface TimeRange {
	startTime?: string
	endTime?: string
	presetValue?: string
}

export interface TimeRangePickerProps {
	startTime?: string
	endTime?: string
	presetValue?: string
	onChange: (range: TimeRange) => void
	/** Register the page-level "D" shortcut to open the picker. */
	hotkey?: boolean
}

export type TimeRangeTab = "relative" | "custom"
