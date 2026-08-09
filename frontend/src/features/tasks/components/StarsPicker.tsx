interface StarsPickerProps {
  value: number
  onChange: (v: number) => void
}

export default function StarsPicker({ value, onChange }: StarsPickerProps) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-2xl transition-transform active:scale-125 ${n <= value ? '' : 'opacity-30 grayscale'}`}
          aria-label={`${n} 星`}
        >
          ⭐
        </button>
      ))}
    </div>
  )
}
