---
layout: page
title: Exploring Yocto
permalink: /exploring-yocto/
description: A journey through the Yocto Project — from basics to advanced recipes and layers.
nav: false
nav_order: 3
---

<div class="post">
  <div class="header-bar">
    <h1>Exploring Yocto</h1>
    <p>A day-by-day journey into the Yocto Project</p>
  </div>

  <ol class="post-list">
    {% assign yocto_posts = site.posts | where_exp: "post", "post.categories contains 'exploring-yocto'" | sort: "date" %}
    {% for post in yocto_posts %}
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

  {% if yocto_posts.size == 0 %}
  <p>Coming soon...</p>
  {% endif %}
</div>
