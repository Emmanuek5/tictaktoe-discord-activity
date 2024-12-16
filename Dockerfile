# Build stage
FROM oven/bun AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and bun.lockb to the working directory
COPY package.json ./
COPY bun.lockb ./

# Install application dependencies
RUN bun install

# Copy the rest of the application code to the working directory
COPY . .

# Build the Next.js application
RUN bun run build

# Show the build output
RUN ls -la
RUN ls -la .next

# Runner stage
FROM oven/bun AS runner

WORKDIR /app

# Copy only the necessary files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lockb ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.env ./.env
COPY --from=builder /app/next.config.ts ./next.config.ts

# Expose the port the app runs on
EXPOSE 3000

# Show the final files
RUN ls -la


# Define the command to run the application
CMD ["bun", "run", "start"]