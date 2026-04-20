function PageHeader({ eyebrow, title, description, actions = null, meta = null }) {
  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          {eyebrow && (
            <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
              {eyebrow}
            </p>
          )}
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-3">
            {actions}
          </div>
        )}
      </div>
      {meta && (
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {meta}
        </div>
      )}
    </section>
  )
}

export default PageHeader
