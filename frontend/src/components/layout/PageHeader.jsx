function PageHeader({ eyebrow, title, description, actions = null, meta = null }) {
  return (
    <section className="workspace-header">
      <div className="panel-header">
        <div className="page-intro">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
      {meta ? <div className="workspace-meta">{meta}</div> : null}
    </section>
  )
}

export default PageHeader
