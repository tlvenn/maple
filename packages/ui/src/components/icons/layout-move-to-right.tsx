import type { IconProps } from "./icon"

const paths: ReadonlyArray<string> = [
	"M4 20H20",
	"M10 16L10 16.01",
	"M12 14L12 14.01",
	"M14 12L14 12.01",
	"M12 10L12 10.01",
	"M10 8.00002L10 8.01002",
	"M18 8L18 16",
	"M22 6L22 18",
	"M2 6L2 18",
	"M4 4H20",
]

function LayoutMoveToRightIcon({ size = 24, className, ...props }: IconProps) {
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
			{paths.map((d) => (
				<path key={d} d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
			))}
		</svg>
	)
}
export { LayoutMoveToRightIcon }
