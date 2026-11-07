export function ProjectReference({ href, name }: { href: string; name: string }) {
  return (
    <a className="text-sm underline" href={href}>
      Project: {name}
    </a>
  );
}
