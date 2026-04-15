package dk.bodegadk;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class BodegaServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(BodegaServerApplication.class, args);
    }
}
