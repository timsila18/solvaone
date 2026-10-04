FROM node:24-bookworm-slim
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
RUN apt-get update && apt-get install -y --no-install-recommends sudo ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global --allow-scripts=agent-browser agent-browser@0.38.2 typescript@5.7.3 && agent-browser install --with-deps
ENV NODE_PATH=/usr/local/lib/node_modules
COPY src/lib/job-desk/portal-browser.ts src/lib/job-desk/portal-browser.ts
COPY services/application-agent services/application-agent
RUN node services/application-agent/build-runner.cjs
RUN mkdir /data && chown -R node:node /data /app /opt/browsers
USER node
ENV APPLICATION_AGENT_DATA_DIR=/data PORT=8080
VOLUME /data
EXPOSE 8080
CMD ["node", "services/application-agent/server.mjs"]
