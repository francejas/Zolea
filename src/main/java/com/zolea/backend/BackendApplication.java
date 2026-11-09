package com.zolea.backend;

import com.zolea.backend.config.TimeConfig;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.TimeZone;

@SpringBootApplication
@EnableScheduling
public class BackendApplication {

	public static void main(String[] args) {
		// La zona de la JVM decide cómo se guardan las horas: la conexión las pasa a UTC
		// (serverTimezone=UTC) desde la zona de la JVM. Sin fijarla, en una máquina argentina la base
		// quedaba en UTC y en el contenedor de Compose, que corre en UTC, en hora argentina. Con la
		// zona del balneario, la base guarda UTC en cualquier máquina. Ver docs/decisiones.md, 17.
		TimeZone.setDefault(TimeZone.getTimeZone(TimeConfig.RESORT_ZONE));
		SpringApplication.run(BackendApplication.class, args);
	}

}
