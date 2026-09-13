FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
USER node
EXPOSE 3000
# Shell form so PORT overrides from the platform are honoured.
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/healthz" || exit 1
# Cap the heap so abuse kills this container, not co-located services. Pair with a
# container memory limit (~256 MB) in the deploy platform.
CMD ["node", "--max-old-space-size=160", "src/index.ts"]
