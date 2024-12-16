# Build stage
FROM oven/bun AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lockb ./
COPY tsconfig.json ./

# Install dependencies
RUN bun install

# Copy necessary files for the web app
COPY app ./app
COPY components ./components
COPY contexts ./contexts
COPY lib ./lib
COPY public ./public
COPY types ./types
COPY server/types.ts ./server/types.ts
COPY server  ./server
COPY utils ./utils
COPY next.config.ts ./
COPY postcss.config.mjs ./
COPY tailwind.config.ts ./

# Build the application
RUN bun run build

# Production image
FROM oven/bun AS runner

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/bun.lockb ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["bun", "run", "start"]
