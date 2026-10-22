FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build

# Copy full server module and build with Maven.
COPY . .
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre AS runtime
LABEL org.opencontainers.image.source=https://github.com/CheatInNeed/BodegaDK
WORKDIR /app

# curl is used by the Docker healthcheck (infra/docker-compose.yml).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Commit SHA from CI, reported by GET /health so deploys can be verified.
# Declared after the apt layer so a new SHA does not invalidate the curl install cache.
ARG APP_VERSION=dev
ENV BODEGADK_VERSION=${APP_VERSION}

# Spring Boot Maven output is target/*.jar (not build/libs/*.jar).
COPY --from=build /build/target/*.jar app.jar

# 8080: app (REST + WS, proxied by nginx). 8081: actuator health/metrics, internal only.
EXPOSE 8080 8081
ENTRYPOINT ["java","-jar","/app/app.jar"]
