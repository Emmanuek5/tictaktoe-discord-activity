FROM oven/bun 

WORKDIR /app

# Copy package files
COPY package.json ./
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


# Build the web app
RUN ["bun", "run", "build"]

# Expose port 3000
EXPOSE 3000

# Start the web app
CMD ["bun", "run", "start"]