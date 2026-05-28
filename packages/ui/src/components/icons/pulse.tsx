import type { IconProps } from "./icon"

const paths: ReadonlyArray<string> = [
	"M6 18.01L6 18",
	"M18 7.01001L18 7.00001",
	"M8 20.01L8 20",
	"M2 16L4 16",
	"M14 9L16 9",
	"M20 5L22 5",
	"M10 16L10 18",
	"M12 11L12 14",
]

function PulseIcon({ size = 24, className, ...props }: IconProps) {
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
export { PulseIcon }
