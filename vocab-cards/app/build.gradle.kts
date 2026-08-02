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
        versionCode = 2
        versionName = "0.2.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}
