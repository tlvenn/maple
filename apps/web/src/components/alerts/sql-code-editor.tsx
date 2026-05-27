import { useRef } from "react"
import { tokenizeSql } from "@/lib/sql-highlight"

/**
 * SQL editor with syntax highlighting: a transparent textarea layered over a
 * highlighted `<pre>` (same overlay technique as the dashboard raw-SQL panel),
 * so the shared SQL tokenizer colors keywords, strings, and `$__`
 * macros while keeping native textarea editing.
 */
export function SqlCodeEditor({
	id,
	value,
	onChange,
}: {
	id: string
	value: string
	onChange: (value: string) => void
}) {
	const preRef = useRef<HTMLPreElement>(null)
	return (
		<div className="relative w-full text-xs font-mono leading-5">
			<pre
				ref={preRef}
				aria-hidden
				className="border-input pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 leading-5"
			>
				<code>
					{tokenizeSql(value).map((token) => (
						<span key={token.start} className={token.className}>
							{token.text}
						</span>
					))}
					{"\n"}
				</code>
			</pre>
			<textarea
				id={id}
				aria-label="SQL query"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onScroll={(e) => {
					const pre = preRef.current
					if (!pre) return
					pre.scrollTop = e.currentTarget.scrollTop
					pre.scrollLeft = e.currentTarget.scrollLeft
				}}
				spellCheck={false}
				rows={10}
				className="border-input caret-foreground focus-visible:ring-ring relative w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-xs leading-5 text-transparent outline-none focus-visible:ring-1"
			/>
		</div>
	)
}
