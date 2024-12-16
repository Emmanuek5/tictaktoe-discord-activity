# Use Bun as the base image
FROM oven/bun

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and bun.lockb to the working directory
COPY package.json ./
COPY bun.lockb ./

# Install application dependencies
RUN bun install

# Copy the rest of the application code to the working directory
COPY . .

# Copy .env file to the container
COPY .env .env

# Build the Next.js application
RUN bun run build

# Expose the port the app runs on
EXPOSE 3000

RUN ls

# Define the command to run the application
CMD ["bun", "run", "start"]