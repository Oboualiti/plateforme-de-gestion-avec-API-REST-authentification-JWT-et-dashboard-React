function PageHeader({ eyebrow, title, description, actions = null, meta = null }) {
  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          {description && <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
      {meta && <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">{meta}</div>}
    </section>
  );
}

export default PageHeader;
