import type { IconProps } from "./icon"

const paths: ReadonlyArray<string> = [
	"M13 9L13 9.01",
	"M15 11L15 11.01",
	"M21 17L21 17.01",
	"M23 15L23 15.01",
	"M9 1L9 1.01",
	"M7 3L7 3.01",
	"M9 19H7",
	"M21 13H17",
	"M11 3L11 7",
	"M3 10L3 13",
	"M14 21L11 21",
	"M5 5L5 8",
	"M19 19L16 19",
	"M5 15L5 17",
]

function MoonIcon({ size = 24, className, ...props }: IconProps) {
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
export { MoonIcon }
