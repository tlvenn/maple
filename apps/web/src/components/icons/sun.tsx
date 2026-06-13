import type { IconProps } from "./icon"

const paths: ReadonlyArray<string> = [
	"M12 21L12 23",
	"M20 20H20.01",
	"M4 20H4.01",
	"M18 18H18.01",
	"M6 18H6.01",
	"M11 17L13 17",
	"M15 15H15.01",
	"M9 15H9.01",
	"M23.005 11.995L21.005 11.995",
	"M3.005 11.995L1.005 11.995",
	"M17 11L17 13",
	"M6.99999 11L7 13",
	"M15 9H15.01",
	"M9 9H9.01",
	"M11 7.00001L13 7",
	"M18 6H18.01",
	"M6 6H6.01",
	"M20 4H20.01",
	"M4 4H4.01",
	"M12 1L12 3",
]

function SunIcon({ size = 24, className, ...props }: IconProps) {
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
export { SunIcon }
