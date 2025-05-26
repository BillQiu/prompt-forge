This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

### GitHub Pages (Automatic)

This project is configured for automatic deployment to GitHub Pages using GitHub Actions.

**Setup:**

1. Enable GitHub Pages in your repository settings
2. Set the source to "GitHub Actions"
3. Push to the `main` branch to trigger automatic deployment

**Workflow:**
- The GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically builds and deploys the project
- Builds are triggered on every push to the `main` branch
- The site will be available at `https://username.github.io/repository-name`

**Manual Build:**
```bash
pnpm run build
```

The static files will be generated in the `out/` directory.

### Custom Domain (Optional)

To use a custom domain:

1. Add a `CNAME` file in the `public/` directory with your domain name
2. Configure your DNS provider to point to GitHub Pages
3. Enable custom domain in repository settings

### Troubleshooting

- Check GitHub Actions logs for build errors
- Ensure all API keys are properly configured as GitHub Secrets
- Verify that paths are relative and not hardcoded

## Deploy on Vercel

Alternatively, you can deploy using the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
