# ---- Build stage ----
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

# REACT_APP_BACKEND_URL must be passed as build arg (Render: set in dashboard)
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

RUN CI=false yarn build

# ---- Serve stage ----
FROM node:18-alpine AS runner

WORKDIR /app

RUN yarn global add serve

COPY --from=builder /app/build ./build

EXPOSE 3000

CMD ["sh", "-c", "serve -s build -l ${PORT:-3000}"]
