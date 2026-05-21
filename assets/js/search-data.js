// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-about",
    title: "about",
    section: "Navigation",
    handler: () => {
      window.location.href = "/";
    },
  },{id: "nav-blog",
          title: "blog",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/blog/";
          },
        },{id: "nav-cv",
          title: "cv",
          description: "This is a description of the page. You can modify it in &#39;_pages/cv.md&#39;. You can also change or remove the top pdf download button.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/cv/";
          },
        },{id: "dropdown-bookshelf",
              title: "bookshelf",
              description: "",
              section: "Dropdown",
              handler: () => {
                window.location.href = "/books/";
              },
            },{id: "dropdown-blog",
              title: "blog",
              description: "",
              section: "Dropdown",
              handler: () => {
                window.location.href = "/blog/";
              },
            },{id: "post-dynamic-layers-in-yocto",
        
          title: "Dynamic Layers in Yocto",
        
        description: "",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/yocto-dynamic-layers/";
          
        },
      },{id: "post-day-1-getting-started",
        
          title: "Day 1: Getting Started",
        
        description: "",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/yocto-day1/";
          
        },
      },{id: "post-day-1-getting-started",
        
          title: "Day 1: Getting Started",
        
        description: "",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/tinyml-day1/";
          
        },
      },{id: "post-day-1-getting-started",
        
          title: "Day 1: Getting Started",
        
        description: "",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/rust-day1/";
          
        },
      },{id: "post-day-1-getting-started",
        
          title: "Day 1: Getting Started",
        
        description: "",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/protocols-day1/";
          
        },
      },{id: "post-day-1-getting-started",
        
          title: "Day 1: Getting Started",
        
        description: "",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/kernel-device-driver-day1/";
          
        },
      },{id: "post-neural-network-implementation-on-fpga-using-hls",
        
          title: "Neural Network Implementation on FPGA using HLS",
        
        description: "",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2024/dnn-fpga/";
          
        },
      },{id: "books-the-godfather",
          title: 'The Godfather',
          description: "",
          section: "Books",handler: () => {
              window.location.href = "/books/the_godfather/";
            },},{id: "news-spi-tools-now-supports-android",
          title: 'spi-tools now supports Android',
          description: "",
          section: "News",handler: () => {
              window.location.href = "/news/announcement_2/";
            },},{id: "news-i-have-finally-completed-my-studies-and-graduated-in-october-2025",
          title: 'I have finally completed my studies and graduated in October 2025!🍺',
          description: "",
          section: "News",},{id: "projects-project-1",
          title: 'project 1',
          description: "with background image",
          section: "Projects",handler: () => {
              window.location.href = "/projects/1_project/";
            },},{id: "projects-project-2",
          title: 'project 2',
          description: "a project with a background image and giscus comments",
          section: "Projects",handler: () => {
              window.location.href = "/projects/2_project/";
            },},{id: "projects-project-3-with-very-long-name",
          title: 'project 3 with very long name',
          description: "a project that redirects to another website",
          section: "Projects",handler: () => {
              window.location.href = "/projects/3_project/";
            },},{id: "projects-project-4",
          title: 'project 4',
          description: "another without an image",
          section: "Projects",handler: () => {
              window.location.href = "/projects/4_project/";
            },},{id: "projects-project-5",
          title: 'project 5',
          description: "a project with a background image",
          section: "Projects",handler: () => {
              window.location.href = "/projects/5_project/";
            },},{id: "projects-project-6",
          title: 'project 6',
          description: "a project with no image",
          section: "Projects",handler: () => {
              window.location.href = "/projects/6_project/";
            },},{id: "projects-project-7",
          title: 'project 7',
          description: "with background image",
          section: "Projects",handler: () => {
              window.location.href = "/projects/7_project/";
            },},{id: "projects-project-8",
          title: 'project 8',
          description: "an other project with a background image and giscus comments",
          section: "Projects",handler: () => {
              window.location.href = "/projects/8_project/";
            },},{id: "projects-project-9",
          title: 'project 9',
          description: "another project with an image 🎉",
          section: "Projects",handler: () => {
              window.location.href = "/projects/9_project/";
            },},{
        id: 'social-cv',
        title: 'CV',
        section: 'Socials',
        handler: () => {
          window.open("/assets/pdf/cv.pdf", "_blank");
        },
      },{
        id: 'social-email',
        title: 'email',
        section: 'Socials',
        handler: () => {
          window.open("mailto:%6D%61%6A%69%64%69%69.%70%61%72%73%61@%67%6D%61%69%6C.%63%6F%6D", "_blank");
        },
      },{
        id: 'social-github',
        title: 'GitHub',
        section: 'Socials',
        handler: () => {
          window.open("https://github.com/parsamajidi21", "_blank");
        },
      },{
        id: 'social-linkedin',
        title: 'LinkedIn',
        section: 'Socials',
        handler: () => {
          window.open("https://www.linkedin.com/in/parsamajidi/", "_blank");
        },
      },{
      id: 'light-theme',
      title: 'Change theme to light',
      description: 'Change the theme of the site to Light',
      section: 'Theme',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: 'Change theme to dark',
      description: 'Change the theme of the site to Dark',
      section: 'Theme',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: 'Use system default theme',
      description: 'Change the theme of the site to System Default',
      section: 'Theme',
      handler: () => {
        setThemeSetting("system");
      },
    },];
