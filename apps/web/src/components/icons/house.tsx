import type { IconProps } from "./icon"

const paths: ReadonlyArray<string> = [
	"M12 21V17",
	"M11 2H13",
	"M21 19L21 10",
	"M3 19L3 10",
	"M5 8.00999V7.99999",
	"M7 6.00999V5.99999",
	"M9 4.00999V3.99999",
	"M15 4.00999V3.99999",
	"M17 6.00999V5.99999",
	"M19 8.00999V7.99999",
	"M5 21H19",
]

function HouseIcon({ size = 24, className, ...props }: IconProps) {
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
export { HouseIcon }
