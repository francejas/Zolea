package com.zolea.backend.services;

import com.zolea.backend.dtos.resort.ResortPhotoResponse;
import com.zolea.backend.exceptions.resort.InvalidResortPhotoException;
import com.zolea.backend.exceptions.resort.ResortPhotoNotFoundException;
import com.zolea.backend.models.ResortPhoto;
import com.zolea.backend.repositories.ResortPhotoRef;
import com.zolea.backend.repositories.ResortPhotoRepository;
import com.zolea.backend.repositories.ResortRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Las fotos del balneario (GH-67): subirlas, ordenarlas, borrarlas y mostrarlas.
 *
 * <p>Las tres primeras son siempre sobre el balneario del administrador que pide, que llega desde
 * la sesión. Mostrar una es público: la ficha la pone en un {@code <img>}, que no manda el token.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ResortPhotoService {

    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};

    private final ResortPhotoRepository photoRepository;
    private final ResortRepository resortRepository;

    /**
     * Suma las fotos al final del balneario, en el orden en que llegan.
     *
     * <p>Se revisan todas antes de guardar: si una no sirve, no se guarda ninguna y el mensaje dice
     * cuál y por qué. El tipo sale de los primeros bytes del archivo y no de lo que declara el
     * navegador, que se puede cambiar a mano.
     *
     * @throws InvalidResortPhotoException si no vino ninguna, si una no es jpg, png ni webp, si una
     *                                     pesa más de 5 MB o si el balneario pasaría de 10 fotos.
     */
    @Transactional
    public List<ResortPhotoResponse> upload(Long resortId, List<MultipartFile> files) {
        if (files == null || files.isEmpty()) {
            throw new InvalidResortPhotoException("Elegí al menos una foto.");
        }

        List<ResortPhoto> photos = new ArrayList<>();
        for (MultipartFile file : files) {
            String name = displayName(file);
            if (file.getSize() > ResortPhoto.MAX_BYTES) {
                throw new InvalidResortPhotoException("«" + name + "» pesa más de 5 MB.");
            }
            byte[] data = bytesOf(file);
            String type = detectType(data);
            if (type == null) {
                throw new InvalidResortPhotoException("«" + name + "» no es una foto jpg, png o webp.");
            }
            ResortPhoto photo = new ResortPhoto();
            photo.setContentType(type);
            photo.setData(data);
            photos.add(photo);
        }

        long existing = photoRepository.countByResort(resortId);
        if (existing + photos.size() > ResortPhoto.MAX_PER_RESORT) {
            throw new InvalidResortPhotoException("Un balneario puede tener hasta "
                    + ResortPhoto.MAX_PER_RESORT + " fotos: ya tiene " + existing
                    + " y estás subiendo " + photos.size() + ".");
        }

        int position = photoRepository.findMaxPosition(resortId);
        for (ResortPhoto photo : photos) {
            photo.setResort(resortRepository.getReferenceById(resortId));
            photo.setPosition(++position);
        }
        photoRepository.saveAll(photos);
        return photosOf(resortId);
    }

    /**
     * Guarda el orden nuevo. Tiene que traer todas las fotos del balneario, cada una una vez: así un
     * pedido viejo, armado antes de subir o borrar una, no deja fotos sin lugar.
     *
     * @throws InvalidResortPhotoException si falta una, sobra una o se repite.
     */
    @Transactional
    public List<ResortPhotoResponse> order(Long resortId, List<Long> photoIds) {
        List<Long> current = photoRepository.findRefsByResortIds(List.of(resortId)).stream()
                .map(ResortPhotoRef::idPhoto)
                .toList();
        if (photoIds.size() != current.size() || !new HashSet<>(photoIds).equals(new HashSet<>(current))) {
            throw new InvalidResortPhotoException(
                    "El orden tiene que traer todas las fotos del balneario, cada una una vez.");
        }
        for (int i = 0; i < photoIds.size(); i++) {
            photoRepository.updatePosition(photoIds.get(i), i);
        }
        return photosOf(resortId);
    }

    /**
     * Borra la foto.
     *
     * @throws ResortPhotoNotFoundException si no existe o es de otro balneario.
     */
    @Transactional
    public void delete(Long resortId, Long photoId) {
        if (photoRepository.deleteInResort(photoId, resortId) == 0) {
            throw ResortPhotoNotFoundException.withId(photoId);
        }
    }

    /**
     * La foto, para mostrarla.
     *
     * @throws ResortPhotoNotFoundException si no existe o no es de ese balneario.
     */
    public ResortPhoto find(Long resortId, Long photoId) {
        return photoRepository.findInResort(photoId, resortId)
                .orElseThrow(() -> ResortPhotoNotFoundException.withId(photoId));
    }

    /** Las fotos del balneario, en su orden. */
    public List<ResortPhotoResponse> photosOf(Long resortId) {
        return photosByResort(List.of(resortId)).getOrDefault(resortId, List.of());
    }

    /**
     * Las fotos de esos balnearios, en su orden, en una sola consulta para todo un listado. Un
     * balneario sin fotos no queda en el mapa.
     */
    public Map<Long, List<ResortPhotoResponse>> photosByResort(Collection<Long> resortIds) {
        if (resortIds.isEmpty()) {
            return Map.of();
        }
        return photoRepository.findRefsByResortIds(resortIds).stream()
                .collect(Collectors.groupingBy(ResortPhotoRef::resortId,
                        Collectors.mapping(ref -> new ResortPhotoResponse(ref.idPhoto(),
                                urlOf(ref.resortId(), ref.idPhoto())), Collectors.toList())));
    }

    /**
     * Dónde se ve la foto. Es una dirección completa, con el servidor que atendió el pedido: el
     * frontend corre en otro puerto y la pone tal cual en un {@code <img>}, igual que las
     * direcciones de afuera que tenían los balnearios hasta acá.
     */
    static String urlOf(Long resortId, Long photoId) {
        String path = "/api/resorts/" + resortId + "/photos/" + photoId;
        if (RequestContextHolder.getRequestAttributes() == null) {
            return path;
        }
        return ServletUriComponentsBuilder.fromCurrentContextPath().path(path).toUriString();
    }

    /** jpg, png o webp según los primeros bytes; null si no es ninguna de las tres. */
    private static String detectType(byte[] data) {
        if (data.length >= 3 && (data[0] & 0xFF) == 0xFF && (data[1] & 0xFF) == 0xD8 && (data[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (data.length >= PNG_SIGNATURE.length && startsWith(data, PNG_SIGNATURE, 0)) {
            return "image/png";
        }
        if (data.length >= 12 && startsWith(data, "RIFF".getBytes(StandardCharsets.US_ASCII), 0) && startsWith(data, "WEBP".getBytes(StandardCharsets.US_ASCII), 8)) {
            return "image/webp";
        }
        return null;
    }

    private static boolean startsWith(byte[] data, byte[] prefix, int offset) {
        for (int i = 0; i < prefix.length; i++) {
            if (data[offset + i] != prefix[i]) {
                return false;
            }
        }
        return true;
    }

    /** El nombre del archivo sin la carpeta, que algunos navegadores mandan. */
    private static String displayName(MultipartFile file) {
        String name = StringUtils.getFilename(file.getOriginalFilename());
        return name == null || name.isBlank() ? "Una de las fotos" : name;
    }

    private static byte[] bytesOf(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo leer la foto subida.", e);
        }
    }
}
