const PlaceholderPage = ({ title, description }: { title: string; description: string }) => {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground">Coming soon — this module is under development.</p>
      </div>
    </div>
  );
};

export default PlaceholderPage;
