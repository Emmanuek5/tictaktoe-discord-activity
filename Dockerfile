FROM oven/bun 

WORKDIR /app

# Copy package files
COPY package.json ./
COPY bun.lockb ./
COPY tsconfig.json ./

# Install dependencies
RUN bun install

# Add node_modules/.bin to PATH
ENV PATH /app/node_modules/.bin:$PATH

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
RUN bun run build

# Expose port 3000
EXPOSE 3000

# Verify the environment
RUN which next
RUN ls -la node_modules/.bin/next

# Start the web app when container starts
CMD ["next", "start"]