FROM node:24-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/

RUN npm ci

# Build
COPY . .
RUN npm run build --workspace=packages/contracts
RUN npm run build --workspace=apps/api

# Runtime
FROM node:24-alpine
WORKDIR /app

COPY --from=base /app/package.json ./package.json
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=base /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=base /app/apps/api/package.json ./apps/api/package.json
COPY --from=base /app/apps/api/dist ./apps/api/dist

EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]
