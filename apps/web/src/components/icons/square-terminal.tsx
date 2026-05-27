import type { IconProps } from "./icon"

const paths: ReadonlyArray<string> = [
	"M13 16H17",
	"M19 3H5",
	"M19 21H5",
	"M3 19V5",
	"M21 19V5",
	"M11.01 12L11 12",
	"M9.01001 14L9.00001 14",
	"M7.01001 16L7.00001 16",
	"M7.01001 8L7.00001 8",
	"M9.00999 10L8.99999 10",
]

function SquareTerminalIcon({ size = 24, className, ...props }: IconProps) {
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
			{paths.map((d, i) => (
				<path key={i} d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
			))}
		</svg>
	)
}
export { SquareTerminalIcon }
