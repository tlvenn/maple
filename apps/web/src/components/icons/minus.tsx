import type { IconProps } from "./icon"

function MinusIcon({ size = 24, className, ...props }: IconProps) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			width={size}
			height={size}
			className={className}
			fill="none"
			aria-hidden="true"
			{...props}
		>
			<path d="M3 12L21 12" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
		</svg>
	)
}
export { MinusIcon }
