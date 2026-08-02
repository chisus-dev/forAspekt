plugins {
    id("com.android.application")
}

android {
    namespace = "dev.chisus.lexicards"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.chisus.lexicards"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}
