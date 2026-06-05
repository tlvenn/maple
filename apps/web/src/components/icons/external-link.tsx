import type { IconProps } from "./icon"

// Nucleo Pixel Essential "share-up-right": pixel-dotted diagonal arrow exiting
// a box that's open at the top-right corner.
const paths: ReadonlyArray<string> = [
	"M14 3L21 3L21 10",
	"M19 21L5 21",
	"M3 19L3 5",
	"M21 19L21 15",
	"M9 3L5 3",
	"M13 11L13 11.01",
	"M15 9L15 9.01",
	"M17 7L17 7.01",
	"M19 5L19 5.01",
]

function ExternalLinkIcon({ size = 24, className, ...props }: IconProps) {
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
export { ExternalLinkIcon }
