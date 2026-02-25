FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build

# Copy full server module and build with Maven.
COPY . .
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app

# Spring Boot Maven output is target/*.jar (not build/libs/*.jar).
COPY --from=build /build/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
