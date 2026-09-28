interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

export function Button({ variant = 'primary', size = 'md', children, className = '', ...props }: ButtonProps) {
  const baseStyles = 'rounded-lg font-semibold flex items-center justify-center text-center transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 hover-scale-sm button-press whitespace-nowrap min-h-[44px]'
  
  const sizeStyles = {
    xs: 'px-2 py-1.5 text-xs',
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2 text-sm sm:text-base',
    lg: 'px-6 py-3 text-base sm:text-lg'
  }
  
  const variantStyles = {
    primary: 'bg-primary text-white focus:ring-primary hover:shadow-md',
    secondary: 'bg-surface-2 text-content-strong focus:ring-content-muted hover:shadow-md hover:bg-surface-3',
    danger: 'bg-red-600 text-white focus:ring-red-500 hover:shadow-md hover:bg-red-700',
  }

  return (
    <button className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}
