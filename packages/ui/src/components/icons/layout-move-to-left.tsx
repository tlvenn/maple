import type { IconProps } from "./icon"

const paths: ReadonlyArray<string> = [
	"M4 20H20",
	"M14 16.01L14 16",
	"M12 14.01L12 14",
	"M10 12.01L10 12",
	"M12 10.01L12 9.99999",
	"M14 8.00999L14 7.99999",
	"M6 8L6 16",
	"M22 6L22 18",
	"M2 6L2 18",
	"M4 4H20",
]

function LayoutMoveToLeftIcon({ size = 24, className, ...props }: IconProps) {
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
export { LayoutMoveToLeftIcon }
