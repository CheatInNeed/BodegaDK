package dk.bodegadk.push;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "bodegadk.push")
public class PushProperties {
    private String publicKey = "";
    private String privateKey = "";
    private String subject = "mailto:admin@bodegadk.local";

    public boolean enabled() {
        return !blank(publicKey) && !blank(privateKey);
    }

    public String getPublicKey() {
        return publicKey;
    }

    public void setPublicKey(String publicKey) {
        this.publicKey = publicKey == null ? "" : publicKey.trim();
    }

    public String getPrivateKey() {
        return privateKey;
    }

    public void setPrivateKey(String privateKey) {
        this.privateKey = privateKey == null ? "" : privateKey.trim();
    }

    public String getSubject() {
        return subject;
    }

    public void setSubject(String subject) {
        this.subject = blank(subject) ? "mailto:admin@bodegadk.local" : subject.trim();
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
