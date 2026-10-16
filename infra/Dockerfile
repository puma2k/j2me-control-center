FROM --platform=$BUILDPLATFORM eclipse-temurin:8-jdk-jammy@sha256:a42a161e0edc7f0d3815bcfa22ce6d969fb48f69d0d17d4a1affd9800b455385 AS emulator
RUN apt-get update && apt-get install -y --no-install-recommends ant git xvfb libxrender1 libxtst6 libxi6 fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /emulator
RUN git init && git remote add origin https://github.com/TASEmulators/freej2me-plus.git && git fetch --depth 1 origin baca76a4dda6f30abac67fb4a3db009eed05f91c && git checkout FETCH_HEAD && ant -Dcompile.jdk.home=/opt/java/openjdk/jre jar-standalone
COPY runtime/network/javax/microedition/io/ /emulator/src/javax/microedition/io/
COPY runtime/network/NetworkTest.java /network/NetworkTest.java
RUN rm -rf build/classes && ant -Dcompile.jdk.home=/opt/java/openjdk/jre jar-standalone && mkdir -p /network/classes && javac -cp build/freej2me_plus.jar -d /network/classes /network/NetworkTest.java && java -cp build/freej2me_plus.jar:/network/classes NetworkTest
COPY runtime/Bridge.java /bridge/Bridge.java
RUN mkdir /bridge/classes && javac -cp build/freej2me_plus.jar -d /bridge/classes /bridge/Bridge.java
COPY tests/fixture /fixture
RUN mkdir /fixture/classes && javac -source 7 -target 7 -cp build/freej2me_plus.jar -d /fixture/classes /fixture/ControlTest.java && jar cfm /fixture/control-test.jar /fixture/MANIFEST.MF -C /fixture/classes .

FROM eclipse-temurin:8-jdk-jammy@sha256:a42a161e0edc7f0d3815bcfa22ce6d969fb48f69d0d17d4a1affd9800b455385 AS java-runtime

FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS application
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY packages packages
COPY apps apps
COPY runtime runtime
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends xvfb libxrender1 libxtst6 libxi6 libasound2 fonts-dejavu-core fontconfig ca-certificates && rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/opt/java/openjdk PATH="/opt/java/openjdk/bin:$PATH" NODE_ENV=production
WORKDIR /app
COPY --from=java-runtime /opt/java/openjdk /opt/java/openjdk
COPY --from=emulator /emulator /emulator
COPY --from=emulator /bridge /emulator/bridge
COPY --from=emulator /fixture/control-test.jar /opt/fixtures/control-test.jar
COPY --from=application /app/node_modules ./node_modules
COPY --from=application /app/package.json ./package.json
COPY --from=application /app/dist ./dist
COPY --from=application /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /data/games /data/state && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "dist/apps/api/src/index.js"]
