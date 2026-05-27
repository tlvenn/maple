import { useState, type ReactNode } from "react"
import { toast } from "sonner"

import type { VariantProps } from "class-variance-authority"
import { badgeVariants } from "@maple/ui/components/ui/badge"
import { Tooltip, TooltipTrigger, TooltipPopup } from "@maple/ui/components/ui/tooltip"
import { useClipboard } from "@maple/ui/hooks/use-clipboard"
import { cn } from "@maple/ui/utils"

interface CopyableBadgeProps {
	/** The full value written to the clipboard (may differ from the displayed children). */
	value: string
	/** What the badge displays — defaults to the value. */
	children?: ReactNode
	/** Human label for the thing being copied, e.g. "trace ID" or "commit SHA". */
	label: string
	variant?: VariantProps<typeof badgeVariants>["variant"]
	size?: VariantProps<typeof badgeVariants>["size"]
	className?: string
}

export function CopyableBadge({
	value,
	children,
	label,
	variant = "outline",
	size = "default",
	className,
}: CopyableBadgeProps) {
	const clipboard = useClipboard()
	const [copied, setCopied] = useState(false)

	async function handleCopy() {
		try {
			await clipboard.copy(value)
			setCopied(true)
			toast.success(`${label} copied to clipboard`)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			toast.error(`Failed to copy ${label}`)
		}
	}

	return (
		<Tooltip>
			<TooltipTrigger
				render={<button type="button" />}
				onClick={handleCopy}
				aria-label={`Copy ${label}`}
				className={cn(badgeVariants({ variant, size }), "max-w-full", className)}
			>
				{children ?? value}
			</TooltipTrigger>
			<TooltipPopup>{copied ? "Copied!" : `Click to copy ${label}`}</TooltipPopup>
		</Tooltip>
	)
}
