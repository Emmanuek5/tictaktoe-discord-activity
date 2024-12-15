FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lockb ./

# Install dependencies
RUN npm install

# Copy only necessary files for the web app
COPY tsconfig.json .
COPY next.config.ts .
COPY postcss.config.mjs .
COPY tailwind.config.ts .
COPY app ./app
COPY components ./components
COPY contexts ./contexts
COPY lib ./lib
COPY public ./public
COPY types ./types
COPY utils ./utils

# Build the application
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start"]
