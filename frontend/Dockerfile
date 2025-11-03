FROM node:24-alpine AS base

# ENVs (available in production aswell, can be overwritten by commandline or env file)
## DOCKER_WORKDIR would be a classical ARG, but that is not multi layer persistent - shame
ENV DOCKER_WORKDIR="/app"
## We Cannot do `$(date -u +'%Y-%m-%dT%H:%M:%SZ')` here so we use unix timestamp=0
ENV BUILD_DATE="1970-01-01T00:00:00.00Z"
## We cannot do $(npm run version).${BUILD_NUMBER} here so we default to 0.0.0.0
ENV BUILD_VERSION="0.0.0.0"
## We cannot do `$(git rev-parse --short HEAD)` here so we default to 0000000
ENV BUILD_COMMIT="0000000"
## SET NODE_ENV
ENV NODE_ENV="production"
## App relevant Envs
ENV PORT="3000"

# Labels
LABEL org.label-schema.build-date="${BUILD_DATE}"
LABEL org.label-schema.name="webcraftmedia:jahrweiser"
LABEL org.label-schema.description="Ocelot Hosting Frontend"
LABEL org.label-schema.usage="https://github.com/webcraftmedia/jahrweiser/blob/master/frontend/README.md"
LABEL org.label-schema.url="https://github.com/webcraftmedia/jahrweiser/"
LABEL org.label-schema.vcs-url="https://github.com/webcraftmedia/jahrweiser/tree/master/"
LABEL org.label-schema.vcs-ref="${BUILD_COMMIT}"
LABEL org.label-schema.vendor="Webcraft-Media"
LABEL org.label-schema.version="${BUILD_VERSION}"
LABEL org.label-schema.schema-version="1.0"
LABEL maintainer="service@webcraft-media.de"

# Install Additional Software
## install: node-gyp dependencies
# RUN apk --no-cache add g++ make python3

# Settings
## Expose Container Port
EXPOSE ${PORT}
EXPOSE 24678

## Workdir
RUN mkdir -p ${DOCKER_WORKDIR}
WORKDIR ${DOCKER_WORKDIR}

##################################################################################
# DEVELOPMENT (Connected to the local environment, to reload on demand) ##########
##################################################################################
FROM base AS development

# We don't need to copy or build anything since we gonna bind to the
# local filesystem which will need a rebuild anyway

# Run command
# (for development we need to execute npm install since the
#  node_modules are on another volume and need updating)
CMD /bin/sh -c "npm install && npm run dev"

##################################################################################
# BUILD (Does contain all files and is therefore bloated) ########################
##################################################################################
FROM base AS build

# Copy everything
COPY . .
# npm install
RUN npm install --include=dev
# npm build
RUN npm run build

##################################################################################
# TEST ###########################################################################
##################################################################################
#FROM build AS test

# Install Additional Software
# RUN apk add --no-cache bash jq

# Run command
#CMD /bin/sh -c "yarn run dev"

##################################################################################
# PRODUCTION (Does contain only "binary"- and static-files to reduce image size) #
##################################################################################
FROM base AS production

# Copy "binary"-files from build image
COPY --from=build ${DOCKER_WORKDIR}/.output ./.output
# Copy server
#COPY --from=build ${DOCKER_WORKDIR}/server ./server
# Copy package.json & tsconfig.json
COPY --from=build ${DOCKER_WORKDIR}/package.json ./package.json
COPY --from=build ${DOCKER_WORKDIR}/package-lock.json ./package-lock.json
#COPY --from=build ${DOCKER_WORKDIR}/tsconfig.json ./tsconfig.json
# Install production packages
RUN npm install --omit=dev

# Run command
CMD /bin/sh -c "npm run prod:start"