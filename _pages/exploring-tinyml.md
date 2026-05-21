---
layout: page
title: Exploring TinyML
permalink: /exploring-tinyml/
description: A journey through TinyML — deploying machine learning on microcontrollers and edge devices.
nav: false
nav_order: 6
---

<div class="post">
  <div class="header-bar">
    <h1>Exploring TinyML</h1>
    <p>A day-by-day journey into machine learning on embedded devices</p>
  </div>

  <ol class="post-list">
    {% assign tinyml_posts = site.posts | where_exp: "post", "post.categories contains 'exploring-tinyml'" | sort: "date" %}
    {% for post in tinyml_posts %}
    <li>
      <h3>
        <a class="post-title" href="{{ post.url | relative_url }}">{{ post.title }}</a>
      </h3>
      <p>{{ post.description }}</p>
      <p class="post-meta">
        {{ post.date | date: '%B %d, %Y' }}
      </p>
    </li>
    {% endfor %}
  </ol>

  {% if tinyml_posts.size == 0 %}
  <p>Coming soon...</p>
  {% endif %}
</div>
